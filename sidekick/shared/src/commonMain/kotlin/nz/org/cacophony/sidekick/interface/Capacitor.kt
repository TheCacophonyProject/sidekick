package nz.org.cacophony.sidekick.`interface`

import nz.org.cacophony.sidekick.api.CacophonyApi

interface PluginCall {
    fun setKeepAlive(keepAlive: Boolean)
    fun getString(key: String): String?
    fun resolve(data: Map<String, Any>)
    fun reject(message: String)
}

abstract class CapacitorInterface {
    val api = CacophonyApi()
}