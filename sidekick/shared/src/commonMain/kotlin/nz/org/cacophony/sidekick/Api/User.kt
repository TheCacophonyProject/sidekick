package nz.org.cacophony.sidekick.Api

import arrow.core.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.Serializable

typealias Token = String
typealias ID = Int
typealias Email = String
class UserApi(override val client: HttpClient, override val path: String = "users"): Api() {
    sealed class User {
        abstract val email: Email
        data class AuthUser(override val email: Email, val id: ID, val token: Token): User()
    }

    sealed interface AuthError {
        data class NetworkError(val error: String) : AuthError
        data class ServerError(val error: String) : AuthError
        data class InvalidCredentials(val error: String) : AuthError
    }

    @Serializable
    data class AuthRequest(val email: String, val password: String)

    @Serializable
    data class UserData(
        val id: ID,
        val userName: String,
        val email: Email,
        val globalPermission: String,
        val endUserAgreement: Int,
        val emailConfirmed: Boolean,
    )

    @Serializable
    data class AuthResponse(
        val token: String,
        val refreshToken: String,
        val userData: UserData
    )

    private suspend fun validateAuthResponse(response: HttpResponse): Validated<AuthError, User.AuthUser> {
        return when (response.status) {
            HttpStatusCode.OK -> {
                try {
                    val authResult = response.body<AuthResponse>()
                    User.AuthUser(
                        authResult.userData.email,
                        authResult.userData.id,
                        authResult.token
                    ).valid()
                } catch (e: Exception) {
                    AuthError.ServerError("Error parsing response ${e.cause?.message}: ${e.message}").invalid()
                }
            }
            HttpStatusCode.Unauthorized -> AuthError.InvalidCredentials("Invalid credentials").invalid()
            else -> AuthError.ServerError("Server error").invalid()
        }
    }

    private fun validateAuthResult(email: String?, password: String?): Validated<AuthError, AuthRequest> {
        return when {
            email.isNullOrEmpty() && password.isNullOrEmpty() -> AuthError.InvalidCredentials("Email and password are empty")
                .invalid()
            email.isNullOrEmpty() -> AuthError.InvalidCredentials("Email is required").invalid()
            password.isNullOrEmpty() -> AuthError.InvalidCredentials("Password is required").invalid()
            else -> {
                AuthRequest(email, password).valid()
            }
        }
    }

    private suspend fun authRequest(email: Email, password: String): Either<AuthError, User.AuthUser> {
        val path = apiPath(listOf(path,"authenticate"))
        return Either.catch {
            val response = client.post(path) {
                contentType(ContentType.Application.Json)
                setBody(AuthRequest(email, password))
            }
            return validateAuthResponse(response).toEither()
        }.mapLeft { AuthError.NetworkError("Network error to ${path}: ${it.message}") }
    }

    suspend fun authenticateUser(email: String?, password: String?): Either<AuthError, User.AuthUser> {
        return validateAuthResult(email, password).toEither().flatMap { authRequest ->
            authRequest(authRequest.email, authRequest.password)
        }
    }
}