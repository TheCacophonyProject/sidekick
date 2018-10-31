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

import android.content.Context
import android.graphics.PorterDuff
import android.net.nsd.NsdManager
import android.os.Bundle
import android.support.v7.app.AppCompatActivity
import android.support.v7.widget.LinearLayoutManager
import android.support.v7.widget.RecyclerView
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.ProgressBar
import kotlin.concurrent.thread

const val TAG = "cacophony-manager"

class MainActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var discovery: DiscoveryManager
    private lateinit var deviceList: DeviceList
    private lateinit var recDao: RecordingDao

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "onCreate")
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setProgressBarColor()
        //TODO remove this after testing..
        thread(start = true) {
            val db = RecordingRoomDatabase.getDatabase(applicationContext)
            recDao = db.recordingDao()
            recDao.deleteAll()
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
        discovery = DiscoveryManager(nsdManager, deviceList, this)
    }

    private fun setProgressBarColor() {
        val progressBar = findViewById<ProgressBar>(R.id.progressBar)
        progressBar.indeterminateDrawable.setColorFilter(
                resources.getColor(R.color.colorPrimary),
                PorterDuff.Mode.SRC_ATOP
        )
    }

    fun logout(v: View) {
        CacophonyAPI.logout(applicationContext)
        finish()
    }

    fun downloadAll(v : View) {
        for ((_, device) in deviceList.getMap()) {
            device.startDownloadRecordings()
        }
    }

    fun uploadRecordings(v: View) {
        thread(start = true) {
            val recordingsToUpload = recDao.getRecordingsToUpload()
            for (rec in recordingsToUpload) {
                CacophonyAPI.uploadRecording(applicationContext, recordingsToUpload[0])
                break
            }
        }

    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        // Put refresh button into action bar
        menuInflater.inflate(R.menu.refresh, menu)
        return super.onCreateOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == R.id.refresh_button) {
            Log.d(TAG, "refresh")
            discovery.restart(clear = true)
        }
        return super.onOptionsItemSelected(item)
    }

    private fun notifyDeviceListChanged() {
        // notifyDataSetChanged has to be called on the UI thread.
        // notifyDataSetChanged is the most inefficient way of updating the RecyclerView but
        // given the small number of items and low update rate, it's probably fine for now.
        runOnUiThread { deviceListAdapter.notifyDataSetChanged() }
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
}

