package nz.org.cacophony.sidekick

import arrow.core.*
import arrow.core.Either.Companion.resolve
import io.ktor.client.plugins.*
import kotlinx.coroutines.runBlocking

// Zipper class for interface between Capacitor(iOS and Android) and Kotlin to allow direct passing
// of data between the two
interface PluginCall {
    fun setKeepAlive(keepAlive: Boolean)
    fun getString(key: String): String?
    fun resolve(data: Map<String, Any>)
    fun reject(message: String)
}

fun success(call: PluginCall, data: Any? = null) = data
    .rightIfNotNull { call.resolve(mapOf("result" to "success")) }
    .map { call.resolve(mapOf("result" to "success", "data" to it)) }

sealed interface CapacitorInterfaceError {
    data class EmptyKey(val key: String) : CapacitorInterfaceError
}

interface CapacitorInterface {
    fun <T> runCatch(call: PluginCall, block: suspend () -> T) = Either.catch {  runBlocking { block() } }.mapLeft { call.reject(it.message ?: "Unknown error") }
    fun validateCall(call: PluginCall, vararg keys: String): ValidatedNel<CapacitorInterfaceError,  List<String>> =
        keys.toList().traverse {
           val value = call.getString(it)
            when {
                value.isNullOrEmpty() -> CapacitorInterfaceError.EmptyKey(it).invalidNel()
                else -> value.validNel()
            }
        }

}