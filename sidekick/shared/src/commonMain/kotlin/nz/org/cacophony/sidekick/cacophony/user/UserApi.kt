package nz.org.cacophony.sidekick.cacophony.user

import arrow.core.*
import io.ktor.client.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.util.date.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.*
import nz.org.cacophony.sidekick.cacophony.ApiSuccess
import nz.org.cacophony.sidekick.cacophony.Message
import kotlin.time.Duration

// User
typealias ID = Int
typealias Email = String
// Token
typealias Token = String
typealias RefreshToken = String
typealias IsoString = String

// JWT Tokens
data class AuthToken(val token: Token, val refreshToken: RefreshToken, val expiry: IsoString? = null)

class UserApi(override var basePath: String): Api {
    override val currentPath: String = "users"
    override val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                ignoreUnknownKeys = true
            })
        }
        install(Auth) {
            bearer {
                sendWithoutRequest { true }
            }
        }
    }

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


    private suspend fun refreshToken(token: AuthToken): Either<ApiError, AuthToken> =
        postJSON("refresh-session-token", RefreshRequest(token.refreshToken))
            .flatMap { res ->
                validateResponse<RefreshResponse>(res)
                    .map { authResponse ->
                        AuthToken(authResponse.token, authResponse.refreshToken, authResponse.expiry)
                    }
            }

    private fun checkExpiry(token: AuthToken): Either<TokenError, AuthToken>  =
    Duration.parseIsoStringOrNull(token.expiry!!)
        .rightIfNotNull { InvalidIso8601Date }
        .flatMap { if (it.inWholeMilliseconds < getTimeMillis()) token.right() else ExpiredToken.left() }

    suspend fun validateToken(token: AuthToken): Either<ApiError, AuthToken> =
        checkExpiry(token)
            .fold(
                { refreshToken(token) },
                { token.right() }
            )


    suspend fun authenticateUser(email: Email, password: String): Either<ApiError, AuthUser> =
        postJSON("authenticate", AuthRequest(email, password))
            .flatMap { res ->
                validateResponse<AuthResponse>(res)
                    .flatMap { authRes -> AuthUser(email, authRes.userData.id, AuthToken(authRes.token, authRes.refreshToken)).right() }
            }


    suspend fun requestDeletion(token: Token): Either<ApiError, Unit> =
        deleteRequest("request-delete-user", token)
            .flatMap { res -> validateResponse(res) }

}
