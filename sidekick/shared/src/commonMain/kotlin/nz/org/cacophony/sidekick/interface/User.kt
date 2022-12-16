package nz.org.cacophony.sidekick.`interface`

import arrow.core.Either
import kotlinx.coroutines.runBlocking

class UserInterface: CapacitorInterface() {
    fun authenticateUser(call: PluginCall) {
        val email = call.getString("email")
        val password = call.getString("password")
        Either.catch {
            runBlocking {
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
        }.mapLeft {
            call.reject(it.message ?: "Unknown error")
        }
    }
}