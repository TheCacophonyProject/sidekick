package nz.org.cacophony.sidekick

import com.getcapacitor.JSObject
import nz.org.cacophony.sidekick.`interface`.PluginCall

data class PluginCall(val call: com.getcapacitor.PluginCall):
    PluginCall {
    override fun setKeepAlive(keepAlive: Boolean) {
        call.setKeepAlive(keepAlive)
    }

    override fun getString(key: String): String? {
        return call.getString(key)
    }

    override fun reject(message: String) {
        call.reject(message)
    }

    override fun resolve(data: Map<String, Any>) {
        val jsObject = JSObject()
        data.forEach { (key, value) ->
            jsObject.put(key, value)
        }
        call.resolve(jsObject)
    }
}
