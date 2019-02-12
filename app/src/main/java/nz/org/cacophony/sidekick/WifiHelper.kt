package nz.org.cacophony.sidekick

import android.content.Context
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.util.Log
import java.lang.reflect.Method

class WifiHelper(c: Context) {

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

    fun isValidBushnetApEnabled() : Boolean {
        return isApOn() && getApSsid() == "bushnet" && getApPassword() == "feathers"
    }

    fun enableBushnetAp() : Boolean {
        try {
            if (isValidBushnetApEnabled()) return true

            val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
            val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration

            wifiConfig.preSharedKey = "feathers"
            wifiConfig.SSID = "bushnet"

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

    private fun getApPassword() : String {
        val getConfigMethod = wifiManager.javaClass.getMethod("getWifiApConfiguration") as Method
        getConfigMethod.invoke(wifiManager)
        val wifiConfig = getConfigMethod.invoke(wifiManager) as WifiConfiguration
        return wifiConfig.preSharedKey
    }
}