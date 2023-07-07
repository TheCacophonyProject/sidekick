package nz.org.cacophony.sidekick.cacophony

import arrow.core.*
import io.ktor.client.*
import io.ktor.util.date.*
import kotlinx.serialization.Serializable
import nz.org.cacophony.sidekick.*
import kotlin.time.Duration

// User
typealias ID = Int
typealias Email = String

// Token
typealias Token = String
typealias RefreshToken = String
typealias IsoString = String

// JWT Tokens
@Serializable
data class AuthToken(val token: Token, val refreshToken: RefreshToken, val expiry: IsoString? = null)

class UserApi(val api: Api) {
    data class AuthUser(val email: Email, val id: ID, val token: AuthToken)

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

    @Serializable
    data class RefreshResponse(
        val token: String,
        val refreshToken: String,
        val expiry: IsoString,
        val userData: UserData
    )


    @Serializable
    data class DeletionRequest (
        val token: Token
    )

    @Serializable
    data class RefreshRequest (
        val refreshToken: RefreshToken
    )


    private suspend fun refreshToken(token: RefreshRequest): Either<ApiError, AuthToken> =
        api.postJSON("users/refresh-session-token", token)
            .flatMap { res ->
                validateResponse<RefreshResponse>(res)
                    .map { authResponse ->
                        AuthToken(authResponse.token, authResponse.refreshToken, authResponse.expiry)
                    }
            }
    suspend fun validateToken(token: RefreshRequest): Either<ApiError, AuthToken> = refreshToken(token)



    suspend fun authenticateUser(email: Email, password: String): Either<ApiError, AuthUser> =
        api.postJSON("users/authenticate", AuthRequest(email, password))
            .flatMap { res ->
                validateResponse<AuthResponse>(res)
                    .flatMap { authRes -> AuthUser(email, authRes.userData.id, AuthToken(authRes.token, authRes.refreshToken)).right() }
            }


    suspend fun requestDeletion(token: Token): Either<ApiError, Unit> =
        api.deleteRequest("users/request-delete-user", token)
            .flatMap { res -> validateResponse(res) }

}
