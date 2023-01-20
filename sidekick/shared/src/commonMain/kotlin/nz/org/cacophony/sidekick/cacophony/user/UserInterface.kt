package nz.org.cacophony.sidekick.cacophony.user

import arrow.core.Either
import kotlinx.coroutines.runBlocking
import nz.org.cacophony.sidekick.cacophony.CacophonyApi
import nz.org.cacophony.sidekick.CapacitorInterface
import nz.org.cacophony.sidekick.PluginCall

class UserInterface: CapacitorInterface {
    val api = CacophonyApi()
    fun authenticateUser(call: PluginCall) = runCatch(call) {
        validateCall(call, "email", "password").map { (email, password) ->
                api.userApi.authenticateUser(email, password)
                    .fold(
                        { error -> call.reject(error.toString()) },
                        { authUser ->
                            val resolvedObj = mapOf(
                                "id" to authUser.id.toString(),
                                "email" to authUser.email,
                                "token" to authUser.token
                            )
                            call.resolve(resolvedObj)
                        }
                    )
            }
        }
}