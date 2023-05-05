package nz.org.cacophony.sidekick

import arrow.core.*
import io.ktor.client.plugins.*
import io.ktor.util.reflect.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// Zipper class for interface between Capacitor(iOS and Android) and Kotlin to allow direct passing
// of data between the two
interface PluginCall {
    fun setKeepAlive(keepAlive: Boolean)
    fun getString(key: String): String?
    fun resolve(data: Map<String, Any>)
    fun reject(message: String)
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
inline fun <reified T> PluginCall.validateCall(vararg keys: String): Either<CapacitorInterfaceError, T> =
    keys.toList()
        .traverse { key ->
            getString(key)
                .rightIfNotNull { CapacitorInterfaceError.EmptyKey(key) }
                .map { key to it }
        }.map{ pairs -> pairs.associate { it.first to it.second }}.map {
               return try {
                   Json.decodeFromString<T>(Json.encodeToString(it)).right()
               } catch (e: Exception) {
                   CapacitorInterfaceError.EmptyKey("Error decoding json").left()
               }
        }.mapLeft { CapacitorInterfaceError.EmptyKey(it.key) }