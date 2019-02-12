package nz.org.cacophony.sidekick

import android.content.Context
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.util.Log
import java.lang.reflect.Method

class WifiHelper(c: Context) {

    private val validSsid = c.getResources().getString(R.string.valid_ssid)
    private val validPassword = c.getResources().getString(R.string.valid_ap_password)
    private val wifiManager = c.applicationContext.getSystemService(android.content.Context.WIFI_SERVICE) as WifiManager
    private val apSettings : WifiConfiguration
    private val wifiInfo : WifiInfo

    init {
        val getApConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
        apSettings = getApConfigMethod.invoke(wifiManager) as WifiConfiguration

        wifiInfo = wifiManager.connectionInfo
    }

    fun isWifiOn() : Boolean {
        return wifiManager.isWifiEnabled
    }

    fun isApOn() : Boolean {
        val method = wifiManager.javaClass.getDeclaredMethod("getWifiApState") as Method
        val actualState = method.invoke(wifiManager)
        return actualState == 13
    }

    fun getWifiSsid() : String {
        return wifiManager.connectionInfo.ssid
    }

    private fun getApSsid() : String {
        val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
        getConfigMethod.invoke(wifiManager)
        val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration
        return wifiConfig.SSID
    }

    fun isValidApEnabled() : Boolean {
        return isApOn() && getApSsid() == validSsid && getApPassword() == validPassword
    }

    fun enableValidAp() : Boolean {
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
        } catch (e : Exception) {
            Log.e(TAG, e.toString())
            return false
        }
    }

    fun isConnectedToValidNetwork() : Boolean {
        return isValidApEnabled() || getWifiSsid() == "\"$validSsid\""
    }

    private fun getApPassword() : String {
        val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
        getConfigMethod.invoke(wifiManager)
        val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration
        return wifiConfig.preSharedKey
    }
}