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
import android.content.*
import android.graphics.PorterDuff
import android.net.nsd.NsdManager
import android.os.Bundle
import android.os.PowerManager
import android.support.v4.content.ContextCompat
import android.support.v7.app.AppCompatActivity
import android.support.v7.widget.LinearLayoutManager
import android.support.v7.widget.RecyclerView
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.*
import java.io.File
import kotlin.concurrent.thread
import com.google.android.gms.location.*
import android.widget.Toast
import android.content.Intent
import android.location.Location
import android.os.Looper
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.tasks.Task


const val TAG = "cacophony-manager"

class MainActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var discovery: DiscoveryManager
    private lateinit var deviceList: DeviceList
    private lateinit var recDao: RecordingDao
    private lateinit var networkChangeReceiver : NetworkChangeReceiver
    private lateinit var permissionHelper : PermissionHelper
    private var locationRequest : LocationRequest? = null
    @Volatile var uploading = false
    private val locationSettingsUpdateCode = 5

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "onCreate")
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        setProgressBarColor()
        thread(start = true) {
            val db = RecordingRoomDatabase.getDatabase(applicationContext)
            recDao = db.recordingDao()
        }

        permissionHelper = PermissionHelper(applicationContext)
        permissionHelper.checkAll(this)

        findViewById<TextView>(R.id.network_error_message_text).text =
                "Not connected to a '${getResources().getString(R.string.valid_ssid)}' network."

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
        discovery = DiscoveryManager(nsdManager, deviceList, this, ::makeToast, ::setRefreshBar)

        val networkIntentFilter = IntentFilter()
        networkIntentFilter.addAction("android.net.conn.CONNECTIVITY_CHANGE")
        networkIntentFilter.addAction("android.net.wifi.WIFI_STATE_CHANGED")
        networkIntentFilter.addAction("android.net.wifi.WIFI_AP_STATE_CHANGED")
        networkChangeReceiver = NetworkChangeReceiver(::networkUpdate)
        registerReceiver(networkChangeReceiver, networkIntentFilter)
        networkUpdate()
    }

    class NetworkChangeReceiver(val networkUpdate : (() -> Unit)) : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            networkUpdate()
        }
    }

    override fun onDestroy() {
        unregisterReceiver(networkChangeReceiver)
        super.onDestroy()
    }

    private fun networkUpdate() {
        val wifiHelper = WifiHelper(applicationContext)
        val networkErrorMessageLayout = findViewById<LinearLayout>(R.id.network_error_message_layout)
        val networkWarningMessageLayout = findViewById<LinearLayout>(R.id.network_warning_message_layout)
        val networkWarningText = findViewById<TextView>(R.id.network_warning_message_text)

        if (wifiHelper.canAccessApConfig()) {
            if (wifiHelper.isConnectedToValidNetwork()) {
                networkErrorMessageLayout.visibility = View.GONE
            } else {
                networkErrorMessageLayout.visibility = View.VISIBLE
            }
        } else if (wifiHelper.canAccessWifiSsid()) {
            if (wifiHelper.isApOn() || wifiHelper.validWifi()) {
                networkWarningMessageLayout.visibility = View.GONE
            } else {
                networkWarningText.text = "Check that you are connected to a '${getResources().getString(R.string.valid_ssid)}' network"
                networkWarningMessageLayout.visibility = View.VISIBLE
            }
        }
    }

    @Suppress("UNUSED_PARAMETER")
    fun openNetworkSettings(v : View) {
        val intent = Intent()
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        intent.action = android.provider.Settings.ACTION_WIRELESS_SETTINGS
        startActivity(intent)
    }

    @Suppress("UNUSED_PARAMETER")
    fun enableValidAp(v : View) {
        val wifiHelper = WifiHelper(applicationContext)
        makeToast("Turning on hotspot")
        if (wifiHelper.enableValidAp()) {
            makeToast("Hotspot turned on")
        } else {
            makeToast("Failed to turn on hotspot")
        }
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
        uploadButton.isClickable = false
        uploadButton.alpha = .5f

        thread(start = true) {
            val recordingsToUpload = recDao.recordingsToUpload
            val recLen = recordingsToUpload.size
            var recNum = 0
            for (rec in recordingsToUpload) {
                recNum++
                uploadButton.post {
                    uploadButton.text = "Uploading $recNum of $recLen"
                }
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
        discovery.restart(clear = true)
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

    @Suppress("UNUSED_PARAMETER")
    fun setLocationButton(v : View) {
        setDevicesLocation(true)
    }

    private fun setDevicesLocation(requestUpdate : Boolean) {
        if (!permissionHelper.check(Manifest.permission.ACCESS_FINE_LOCATION)) {
            if (requestUpdate) {
                permissionHelper.request(this, Manifest.permission.ACCESS_FINE_LOCATION, permissionHelper.locationUpdate)
            }
            return
        }
        runOnUiThread {
            val updateLocationButton = findViewById<Button>(R.id.set_location)
            updateLocationButton.isClickable = false
            updateLocationButton.text = "Getting location..."

        }
        createLocationRequest()
    }

    private fun createLocationRequest() {
        val locationRequest = LocationRequest.create().apply {
            interval = 10000
            fastestInterval = 5000
            priority = LocationRequest.PRIORITY_HIGH_ACCURACY
            numUpdates = 1
        }

        val builder = LocationSettingsRequest.Builder().addLocationRequest(locationRequest)
        val client: SettingsClient = LocationServices.getSettingsClient(this)
        val task: Task<LocationSettingsResponse> = client.checkLocationSettings(builder.build())

        task.addOnSuccessListener {
            Log.i(TAG, "Have required location settings")
            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
            try {
                fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
            } catch(e: SecurityException) {
                Log.e(TAG, e.toString())
                makeToast("Failed to request location updates")
                resetUpdateLocationButton()
            }
        }

        task.addOnFailureListener { e ->
            Log.i(TAG, "Don't have required location settings.")
            if (e is ResolvableApiException){
                try {
                    Log.i(TAG, "Requesting location settings to be updated")
                    e.startResolutionForResult(this@MainActivity, locationSettingsUpdateCode)
                } catch (sendEx: IntentSender.SendIntentException) {
                    Log.e(TAG, e.toString())
                    resetUpdateLocationButton()
                }
            } else {
                Log.e(TAG, e.toString())
                resetUpdateLocationButton()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when(requestCode) {
            locationSettingsUpdateCode -> {
                if (resultCode == -1) {
                    createLocationRequest()
                } else {
                    makeToast( "Don't have proper location settings to get location.")
                    resetUpdateLocationButton()
                }
            }
        }
    }

    private var locationCallback: LocationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            Log.i(TAG, "location update")
            val locationList = locationResult.locations
            if (locationList.size > 0) {
                val location = locationList[locationList.size - 1]
                Log.i(TAG, "lat ${location.latitude}, long: ${location.longitude}")
                updateDevicesLocation(location)
            } else {
                makeToast("Failed to get new location")
                resetUpdateLocationButton()
            }
            locationRequest = null
        }
    }

    fun updateDevicesLocation(location: Location) {
        runOnUiThread {
            val updateLocationButton = findViewById<Button>(R.id.set_location)
            updateLocationButton.text = "Updating location for nearby devices"
        }
        thread(start = true) {
            for ((_, device) in deviceList.getMap()) {
                if (!device.updateLocation(location)) {
                    makeToast("Failed to update location on '${device.name}'")
                }
            }
            makeToast("Finished updating location for devices")
            resetUpdateLocationButton()
        }
    }

    fun resetUpdateLocationButton() {
        runOnUiThread {
            val updateLocationButton = findViewById<Button>(R.id.set_location)
            updateLocationButton.isClickable = true
            updateLocationButton.text = "Update All Devices Location"
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        when(requestCode) {
            permissionHelper.locationUpdate -> setDevicesLocation(false)
            else -> permissionHelper.onResult(requestCode, permissions, grantResults, ::makeToast)
        }
    }
}
