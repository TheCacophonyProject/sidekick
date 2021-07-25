package nz.org.cacophony.sidekick

import android.Manifest
import android.app.Activity
import android.content.IntentSender
import android.location.Location
import android.os.Looper
import android.util.Log
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.*
import com.google.android.gms.tasks.Task
import kotlin.concurrent.thread

class LocationHelper(
    private val permissionHelper: PermissionHelper,
    private val mainViewModel: MainViewModel,
    private val activity: Activity
) {
    @Volatile
    var bestLocation: Location? = null
    @Volatile
    var locationCount = 0
    private val locationSettingsUpdateCode = 5
    private var messenger = mainViewModel.messenger.value!!

    fun createLocationRequest() {
        val locationRequest = LocationRequest.create().apply {
            interval = 3000
            fastestInterval = 1000
            maxWaitTime = 5000
            priority = LocationRequest.PRIORITY_HIGH_ACCURACY
            numUpdates = LOCATION_MAX_ATTEMPTS
        }

        val builder = LocationSettingsRequest.Builder().addLocationRequest(locationRequest)
        val client: SettingsClient = LocationServices.getSettingsClient(activity)
        val task: Task<LocationSettingsResponse> = client.checkLocationSettings(builder.build())

        task.addOnSuccessListener {
            Log.i(TAG, "Have required location settings")
            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(activity)
            try {
                bestLocation = null
                locationCount = 0
                fusedLocationClient.requestLocationUpdates(locationRequest, makeLocationCallback(fusedLocationClient), Looper.getMainLooper())
            } catch (e: SecurityException) {
                Log.e(TAG, e.toString())
                messenger.alert("Failed to request location updates")

                resetUpdateLocationButton()
            }
        }

        task.addOnFailureListener { e ->
            Log.i(TAG, "Don't have required location settings.")
            if (e is ResolvableApiException) {
                try {
                    Log.i(TAG, "Requesting location settings to be updated")
                    e.startResolutionForResult(activity, locationSettingsUpdateCode)
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

    private fun makeLocationCallback(lc: FusedLocationProviderClient): LocationCallback {
        return object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationCount++
                val location = locationResult.lastLocation
                Log.i(TAG, "lat ${location.latitude}, " +
                        "long: ${location.longitude}, " +
                        "alt: ${location.altitude}, " +
                        "acc: ${location.accuracy}, " +
                        "time: ${location.time}")

                if (location.accuracy >= 100 || location.latitude == 0.0 && location.longitude == 0.0) {
                    Log.d(TAG, "location not accurate enough or invalid")
                } else if (bestLocation == null || location.accuracy < bestLocation!!.accuracy) {
                    bestLocation = location
                }

                if (bestLocation != null && (bestLocation!!.accuracy < 20 || locationCount == LOCATION_MAX_ATTEMPTS)) {
                    lc.removeLocationUpdates(this)
                    updateDevicesLocation(bestLocation!!)
                } else if (locationCount == LOCATION_MAX_ATTEMPTS) {
                    lc.removeLocationUpdates(this)
                    messenger.alert("Failed to find a location")
                    resetUpdateLocationButton()
                }
            }
        }
    }

    fun updateDevicesLocation(location: Location) {
        mainViewModel.locationStatusText.value = "Updating location for nearby devices"
        thread(start = true) {
            val failedDevices = mutableListOf<String>()
            val successDevices = mutableListOf<String>()
            for ((_, device) in mainViewModel.deviceList.value!!.getMap()) {
                if (device.updateLocation(location)) {
                    successDevices.add(device.name)
                } else {
                    failedDevices.add(device.name)
                }
            }
            if (failedDevices.size == 0 && successDevices.size == 0) {
                messenger.alert("No devices found.")
            }
            else if (failedDevices.size == 0) {
                messenger.alert("Finished updating location on: ${successDevices.joinToString(", ")}.\nWith an accuracy of ${location.accuracy}m")
            } else {
                val message = "Failed to update location on: ${failedDevices.joinToString(", ")}"
                Log.e(TAG, message)
                messenger.alert(message)
            }
            resetUpdateLocationButton()
        }
    }

    private fun resetUpdateLocationButton() {
        mainViewModel.locationStatusText.postValue("")
    }

    fun setDevicesLocation() {
        if (!permissionHelper.check(Manifest.permission.ACCESS_FINE_LOCATION)) {
            Log.i(TAG, "don't have location permission, requesting it..")
            permissionHelper.request(activity, Manifest.permission.ACCESS_FINE_LOCATION, permissionHelper.locationUpdate)
            Log.i(TAG, "requested location")
            return
        }
        Log.i(TAG, "has location permission")
        mainViewModel.locationStatusText.value = "Getting location"
        createLocationRequest()
    }
}