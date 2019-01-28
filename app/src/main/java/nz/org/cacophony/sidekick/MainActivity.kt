/*
 * sidekick - Network discovery for Cacophony Project devices
 * Copyright (C) 2018, The Cacophony Project
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

package nz.org.cacophony.sidekick

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.PorterDuff
import android.net.nsd.NsdManager
import android.os.Bundle
import android.os.PowerManager
import android.support.v4.app.ActivityCompat
import android.support.v4.content.ContextCompat
import android.support.v7.app.AppCompatActivity
import android.support.v7.widget.LinearLayoutManager
import android.support.v7.widget.RecyclerView
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.io.File
import kotlin.concurrent.thread


const val TAG = "cacophony-manager"
const val REQUEST_WRITE_EXTERNAL_STORAGE = 1

class MainActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var discovery: DiscoveryManager
    private lateinit var deviceList: DeviceList
    private lateinit var recDao: RecordingDao
    @Volatile var uploading = false

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "onCreate")
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setProgressBarColor()
        thread(start = true) {
            val db = RecordingRoomDatabase.getDatabase(applicationContext)
            recDao = db.recordingDao()
        }
        if (!hasWritePermission()) {
            makeToast("Application needs write permission to download files", Toast.LENGTH_LONG)
        }

        deviceList = DeviceList()
        deviceListAdapter = DeviceListAdapter(deviceList)
        deviceList.setOnChanged { notifyDeviceListChanged() }

        val recyclerLayoutManager = LinearLayoutManager(this)
        recyclerView = findViewById<RecyclerView>(R.id.device_list).apply {
            setHasFixedSize(true)
            layoutManager = recyclerLayoutManager
            adapter = deviceListAdapter
        }

        val nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discovery = DiscoveryManager(nsdManager, deviceList, this, ::makeToast, ::setRefreshBar, ::hasWritePermission)
    }

    private fun setRefreshBar(active : Boolean) {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        if (active) {
            progressBar.visibility = View.VISIBLE
        } else {
            progressBar.visibility = View.INVISIBLE
        }
    }

    override fun onBackPressed() {
        val intent = Intent(Intent.ACTION_MAIN)
        intent.addCategory(Intent.CATEGORY_HOME)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(intent)
    }

    private fun setProgressBarColor() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        progressBar.indeterminateDrawable.setColorFilter(
                ContextCompat.getColor(this, R.color.colorPrimary),
                PorterDuff.Mode.SRC_ATOP
        )
        progressBar.visibility = View.INVISIBLE
    }

    @Suppress("UNUSED_PARAMETER")
    fun downloadAll(v : View) {
        for ((_, device) in deviceList.getMap()) {
            device.startDownloadRecordings()
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun uploadRecordings(v: View) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sidekick:uploading_recordings")
        mWakeLock.acquire(5*60*1000)
        if (uploading) { return }
        uploading = true
        val uploadButton = findViewById<Button>(R.id.upload_recordings_button)
        uploadButton.text = "Uploading"
        uploadButton.isClickable = false
        uploadButton.alpha = .5f

        thread(start = true) {
            val recordingsToUpload = recDao.getRecordingsToUpload()
            for (rec in recordingsToUpload) {
                try {
                    CacophonyAPI.uploadRecording(applicationContext, rec)
                    recDao.setAsUploaded(rec.id)
                    File(rec.recordingPath).delete()
                } catch (e : Exception) {
                    if (e.message == null) {
                        makeToast("Unknown error with uploading recordings")
                    } else {
                        makeToast(e.message!!)
                    }
                }
            }
            if (recordingsToUpload.size == 0) {
                makeToast("No recordings to upload")
            } else {
                makeToast("Finished uploading recordings")
            }
            uploadButton.post {
                uploadButton.text = "Upload Recordings"
                uploadButton.isClickable = true
                uploadButton.alpha = 1f
            }
            uploading = false
            mWakeLock.release()
        }
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        // Put settings button into action bar
        menuInflater.inflate(R.menu.settings, menu)
        return super.onCreateOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == R.id.settings_button) {
            Log.d(TAG, "settings")
            val intent = Intent(this, SettingsActivity::class.java)
            startActivity(intent)
        }
        return super.onOptionsItemSelected(item)
    }

    @Suppress("UNUSED_PARAMETER")
    fun refreshDevices(v: View) {
        Log.d(TAG, "refresh")
        discovery.restart(clear = true)
    }

    private fun notifyDeviceListChanged() {
        // notifyDataSetChanged has to be called on the UI thread.
        // notifyDataSetChanged is the most inefficient way of updating the RecyclerView but
        // given the small number of items and low update rate, it's probably fine for now.
        runOnUiThread {
            val placeholderText = findViewById<TextView>(R.id.placeholder_text)
            if (deviceList.size() == 0) {
                placeholderText.visibility = View.VISIBLE
            } else {
                placeholderText.visibility = View.GONE
            }
            deviceListAdapter.notifyDataSetChanged()
        }
    }

    override fun onResume() {
        Log.d(TAG, "onResume")
        super.onResume()
        discovery.restart()
    }

    override fun onPause() {
        Log.d(TAG, "onPause")
        super.onPause()
        discovery.stop()
    }

    fun makeToast(message : String, length : Int = Toast.LENGTH_LONG) {
        runOnUiThread {
            Toast.makeText(applicationContext, message, length).show()
        }
    }

    fun hasWritePermission() : Boolean {
        val permission = ContextCompat.checkSelfPermission(this,
                android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        if (permission == PackageManager.PERMISSION_GRANTED) {
            return true
        }
        ActivityCompat.requestPermissions(this,
                arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE),
                REQUEST_WRITE_EXTERNAL_STORAGE)
        return false
    }


    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        when (requestCode) {
            REQUEST_WRITE_EXTERNAL_STORAGE -> {
                if ((grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)) {
                    makeToast("External write permission granted.")
                } else {
                    makeToast("Will not be able to download recordings without write permission.")
                }
                return
            }
        }
    }
}
