package nz.org.cacophony.sidekick.cacophony.user

import arrow.core.Either
import arrow.core.left
import arrow.core.right
import io.ktor.util.date.*
import nz.org.cacophony.sidekick.cacophony.CacophonyApi
import nz.org.cacophony.sidekick.CapacitorInterface
import nz.org.cacophony.sidekick.PluginCall
import nz.org.cacophony.sidekick.device.Device
import nz.org.cacophony.sidekick.device.DeviceApi
import nz.org.cacophony.sidekick.success
import kotlin.time.Duration

class UserInterface: CapacitorInterface {
    val api = CacophonyApi()
    fun authenticateUser(call: PluginCall) = runCatch(call) {
        validateCall(call, "email", "password").map { (email, password) ->
                api.userApi().authenticateUser(email, password)
                    .fold(
                        { error -> call.reject(error.toString()) },
                        { authUser ->
                            val resolvedObj = mapOf(
                                "id" to authUser.id.toString(),
                                "email" to authUser.email,
                                "token" to authUser.token.token,
                                "refreshToken" to authUser.token.refreshToken,
                            )
                            success(call, resolvedObj)
                        }
                    )
            }
        }

    private fun getTokenFromCall(call: PluginCall): Either<Unit, AuthToken> = validateCall(call, "token", "refreshToken", "expiry")
        .map { (token, refreshToken, expiry) -> AuthToken(token, refreshToken, expiry) }
        .mapLeft { call.reject("Invalid arguments for token $it") }.toEither()


    fun requestDeletion(call: PluginCall) = runCatch(call) {
        validateCall(call, "token").map { (token) ->
            api.userApi().requestDeletion(token)
                .fold(
                    { error -> call.reject(error.toString()) },
                    { success(call) }
                )
        }
    }

    fun validateToken(call: PluginCall) = runCatch(call) {
        getTokenFromCall(call).map { token ->
            api.userApi().validateToken(token)
                .fold(
                    { error -> call.reject(error.toString()) },
                    { authUser ->
                        success(call, mapOf(
                            "token" to authUser.token,
                            "refreshToken" to authUser.refreshToken,
                            "expiry" to authUser.expiry,
                        ))
                    }
                )
        }
    }

    fun setToTestServer(call: PluginCall) = runCatch(call) {
        api.setToTest();
        success(call)
    }

    fun setToProductionServer(call: PluginCall) = runCatch(call) {
        api.setToProd();
        success(call)
    }
}