package nz.org.cacophony.sidekick

import com.getcapacitor.JSObject
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import org.json.JSONArray

interface EventEmitter {
    fun emitEvent(eventName: String, data: JSObject)
}

data class pluginCall(val call: com.getcapacitor.PluginCall, val eventEmitter: EventEmitter? = null): PluginCall {
    override fun setKeepAlive(keepAlive: Boolean) {
        call.setKeepAlive(keepAlive)
    }

    override fun getString(key: String): String? {
        return call.getString(key)
    }

    override fun getDataAsJsonString(): String? {
        val jsObject = call.data
        return jsObject?.toString()
    }

    override fun reject(message: String) {
        call.reject(message)
    }
    // create a recursive function to convert a map to a JSObject
    fun mapToJSObject(map: Map<String, Any>): JSObject {
        val jsObject = JSObject()

        for ((key, value) in map) {
            when (value) {
                is Map<*, *> -> jsObject.put(key, mapToJSObject(value as Map<String, Any>))
                is List<*> -> jsObject.put(key, JSONArray(value.map { v -> if (v is Map<*, *>) mapToJSObject(v as Map<String, Any>) else v }))
                else -> jsObject.put(key, value)
            }
        }

        return jsObject
    }

    override fun resolve(data: Map<String, Any>) {
        call.resolve(mapToJSObject(data))
    }

    override fun notifyListeners(eventName: String, data: Map<String, Any>) {
        eventEmitter?.emitEvent(eventName, mapToJSObject(data))
    }
}
