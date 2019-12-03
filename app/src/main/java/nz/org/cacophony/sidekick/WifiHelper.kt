package nz.org.cacophony.sidekick

import android.Manifest
import android.content.Context
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.util.Log
import java.lang.reflect.Method

class WifiHelper(val c: Context) {

    private val validSsid = c.getResources().getString(R.string.valid_ssid)
    private val validPassword = c.getResources().getString(R.string.valid_ap_password)
    private val wifiManager = c.applicationContext.getSystemService(android.content.Context.WIFI_SERVICE) as WifiManager

    private lateinit var apSettings: WifiConfiguration
    private var wifiInfo: WifiInfo


    init {
        try {
            val getApConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
            apSettings = getApConfigMethod.invoke(wifiManager) as WifiConfiguration
        } catch (e: java.lang.Exception) {
            Log.e(TAG, e.toString())
        }
        wifiInfo = wifiManager.connectionInfo
    }

    fun isWifiOn(): Boolean {
        return wifiManager.isWifiEnabled
    }

    fun validWifi(): Boolean {
        return getWifiSsid() == "\"$validSsid\"" || getWifiSsid() == validSsid
    }

    fun isApOn(): Boolean {
        val method = wifiManager.javaClass.getDeclaredMethod("getWifiApState") as Method
        val actualState = method.invoke(wifiManager)
        return actualState == 13
    }

    fun getWifiSsid(): String? {
        return wifiManager.connectionInfo.ssid
    }

    private fun getApSsid(): String {
        val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
        getConfigMethod.invoke(wifiManager)
        val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration
        return wifiConfig.SSID
    }

    fun isValidApEnabled(): Boolean {
        return isApOn() && getApSsid() == validSsid && getApPassword() == validPassword
    }

    fun canAccessApConfig(): Boolean {
        try {
            val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
            getConfigMethod.invoke(wifiManager) as WifiConfiguration
            return true
        } catch (e: java.lang.Exception) {
            return false
        }
    }

    fun canAccessWifiSsid(): Boolean {
        // If you can access fine location you can read the wifi SSID.
        return PermissionHelper(c).check(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    fun enableValidAp(): Boolean {
        try {
            if (isValidApEnabled()) return true

            val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
            val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration

            wifiConfig.preSharedKey = validPassword
            wifiConfig.SSID = validSsid

            val setConfigMethod = wifiManager.javaClass.getMethod("setWifiApConfiguration", WifiConfiguration::class.java)
            setConfigMethod.invoke(wifiManager, wifiConfig)
            wifiManager.isWifiEnabled = false
            val method = wifiManager.javaClass.getMethod("setWifiApEnabled", WifiConfiguration::class.java, Boolean::class.javaPrimitiveType)
            method.invoke(wifiManager, wifiConfig, true)
            return true
        } catch (e: Exception) {
            Log.e(TAG, e.toString())
            return false
        }
    }

    fun isConnectedToValidNetwork(): Boolean {
        return isValidApEnabled() || validWifi()
    }

    private fun getApPassword(): String {
        val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
        getConfigMethod.invoke(wifiManager)
        val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration
        return wifiConfig.preSharedKey
    }
}