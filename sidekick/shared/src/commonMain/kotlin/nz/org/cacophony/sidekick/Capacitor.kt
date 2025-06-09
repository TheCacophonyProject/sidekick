package nz.org.cacophony.sidekick

import arrow.core.*
import io.ktor.client.plugins.*
import io.ktor.util.reflect.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*

// Zipper class for interface between Capacitor(iOS and Android) and Kotlin to allow direct passing
// of data between the two
interface PluginCall {
    fun setKeepAlive(keepAlive: Boolean)
    fun getString(key: String): String?
    fun getDataAsJsonString(): String?
    fun resolve(data: Map<String, Any>)
    fun reject(message: String)
    fun notifyListeners(eventName: String, data: Map<String, Any>)
}


sealed interface CapacitorInterfaceError {
    data class EmptyKey(val key: String) : CapacitorInterfaceError
}

interface CapacitorInterface {
    fun <T> runCatch(call: PluginCall, block: suspend () -> T) = Either.catch { runBlocking { block() } }.mapLeft { call.failure(it.message ?: "Unknown error") }
}

inline fun PluginCall.success(data: Any? = null) = data
    .rightIfNotNull { resolve(mapOf("success" to true)) }
    .map { resolve(mapOf("success" to true, "data" to it)) }

inline fun PluginCall.failure(message: String) = resolve(
    mapOf(
        "success" to false,
        "message" to message
    )
)
inline fun <reified T> PluginCall.validateCall(vararg keys: String): Either<CapacitorInterfaceError, T> {
    val jsonString = getDataAsJsonString()
    if (jsonString == null) {
        return CapacitorInterfaceError.EmptyKey("No data provided").left()
    }
    
    return try {
        // Parse JSON string to JsonElement first to check for required keys
        val jsonElement = Json.parseToJsonElement(jsonString)
        if (jsonElement !is JsonObject) {
            return CapacitorInterfaceError.EmptyKey("Data must be a JSON object").left()
        }
        
        // Check if all required keys are present
        for (key in keys) {
            if (!jsonElement.containsKey(key)) {
                return CapacitorInterfaceError.EmptyKey("Missing required parameter: $key").left()
            }
        }
        
        // Create a lenient JSON instance that ignores unknown keys
        val lenientJson = Json {
            ignoreUnknownKeys = true
        }
        
        // Decode to the target type with lenient JSON
        lenientJson.decodeFromString<T>(jsonString).right()
    } catch (e: Exception) {
        println("Error decoding JSON: $e")
        CapacitorInterfaceError.EmptyKey("Error decoding json: ${e.message}").left()
    }
}