package nz.org.cacophony.sidekick

import android.content.Context
import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.support.v4.app.ActivityCompat
import android.support.v4.content.ContextCompat
import android.util.Log
import android.widget.Toast

const val MULTIPLE_REQUESTS = 1

class PermissionHelper(private val c : Context) {

    private val permissionList = listOf(
            Permission(Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    "External write permission granted.",
                    "Will not be able to download recordings without write permission."),
            Permission(Manifest.permission.ACCESS_FINE_LOCATION,
                    "Location permission granted.",
                    "Can not check wifi setting without location permission")
    )

    fun checkAll(activity: Activity, requestPermissions : Boolean = true) : Boolean {
        val notGrantedPermission = mutableListOf<String>()
        for (p in permissionList) {
            if (!check(p.permissionName)) {
                notGrantedPermission += p.permissionName
            }
        }
        if (notGrantedPermission.size == 0) return true
        if (requestPermissions) {
            ActivityCompat.requestPermissions(activity,
                    notGrantedPermission.toTypedArray(),
                    MULTIPLE_REQUESTS)
        }
        return false
    }

    fun check(name : String) : Boolean {
        return ContextCompat.checkSelfPermission(c, name) == PackageManager.PERMISSION_GRANTED
    }

    fun onResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray, makeToast: (m: String, i : Int) -> Unit) {
        for (p in permissionList) {
            val index = permissions.indexOf(p.permissionName)
            if (index >= 0 && grantResults[index] == PackageManager.PERMISSION_GRANTED) {
                Log.i(TAG, p.successMessage)
                makeToast(p.successMessage, Toast.LENGTH_SHORT)
            } else if (index >= 0) {
                Log.i(TAG, p.failMessage)
                makeToast(p.failMessage, Toast.LENGTH_LONG)
            }
        }
    }
}

class Permission(val permissionName : String, val successMessage : String, val failMessage : String)
