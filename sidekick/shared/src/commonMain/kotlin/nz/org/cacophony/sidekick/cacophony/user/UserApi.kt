package nz.org.cacophony.sidekick.cacophony.user

import arrow.core.*
import io.ktor.client.*
import kotlinx.serialization.Serializable
import nz.org.cacophony.sidekick.Api
import nz.org.cacophony.sidekick.ApiResult
import nz.org.cacophony.sidekick.postJSON
import nz.org.cacophony.sidekick.validateResponse

typealias Token = String
typealias ID = Int
typealias Email = String
class UserApi(override val client: HttpClient, override val basePath: String): Api {
    override val currentPath: String = "users"
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


    suspend fun authenticateUser(email: Email, password: String): Either<ApiResult, User.AuthUser> =
            postJSON("authenticate", AuthRequest(email, password))
                .flatMap { res ->
                    validateResponse<AuthResponse>(res)
                        .flatMap { User.AuthUser(email, it.userData.id, it.token).right() }
                    }



}