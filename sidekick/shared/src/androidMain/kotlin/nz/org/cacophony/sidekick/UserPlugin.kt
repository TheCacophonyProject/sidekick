package nz.org.cacophony.sidekick

import arrow.core.*
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import kotlinx.coroutines.*
import nz.org.cacophony.sidekick.Api.CacophonyApi

@CapacitorPlugin(name = "User")
class UserPlugin: Plugin() {
    val api = CacophonyApi()
    @PluginMethod
    fun authenticateUser(call: PluginCall) {
        val email = call.getString("email")
        val password = call.getString("password")
        try {
            runBlocking {
                when (val authRes = api.userApi.authenticateUser(email, password)) {
                    is Either.Left -> {
                        val error = authRes.value
                        call.reject(error.toString())
                    }
                    is Either.Right -> {
                        val authUser = authRes.value
                        val jsObject = JSObject()
                        jsObject.put("email", authUser.email)
                        jsObject.put("id", authUser.id)
                        jsObject.put("token", authUser.token)
                        call.resolve(jsObject)
                    }
                    else -> {}
                }
            }
        } catch (e: Exception) {
            println("Error: ${e.message}")
            call.reject(e.message)
        }
    }
}