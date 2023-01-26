package nz.org.cacophony.sidekick

import arrow.core.*
import arrow.optics.optics
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.util.date.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.cacophony.user.AuthToken
import nz.org.cacophony.sidekick.cacophony.user.Token
import kotlin.time.Duration

@optics
sealed interface ApiError

@optics
sealed interface TokenError : ApiError
object InvalidIso8601Date: TokenError {
    override fun toString(): String {
        return "Invalid ISO8601 date"
    }
}
object ExpiredToken: TokenError {
    override fun toString(): String {
        return "Token has expired"
    }
}


@optics
sealed class InvalidRequest : ApiError
data class PostError(val message: String, val path: String) : InvalidRequest()
data class GetError(val message: String, val path: String) : InvalidRequest()
data class DeleteError(val message: String, val path: String) : InvalidRequest()
data class FormError(val message: String, val path: String) : InvalidRequest()

@optics
sealed class InvalidResponse : ApiError
object AuthError : InvalidResponse()
object NoContent: InvalidResponse()
data class BadRequest(val message: String) : InvalidResponse()
data class ParsingError(val message: String) : InvalidResponse()
data class UnknownError(val message: String) : InvalidResponse()


interface Api {
    val client: HttpClient
    var basePath: String
    val currentPath: String
    val path: String get() = "$basePath$currentPath"
    fun childPath(child: String): String = "$path/$child"
}

suspend inline fun <reified T> Api.postJSON(
    path: String,
    body: T,
    token: Token? = null
): Either<PostError, HttpResponse> = Either.catch {
    return client.post(childPath(path)) {
        contentType(ContentType.Application.Json)
        body?.let { setBody(body) }
        headers {
            token?.let {
                append(HttpHeaders.Authorization, token)
            }
        }
    }.right()
}.mapLeft { PostError(it.message ?: "Unknown error Post Request", childPath(path)) }

suspend inline fun Api.getRequest(path: String): Either<GetError, HttpResponse> =
    Either.catch {
        return client.get(childPath(path)).right()
    }.mapLeft {
        GetError(it.message ?: "Unknown error Get Request", childPath(path))
    }

suspend inline fun Api.deleteRequest(path: String, token: Token? = null): Either<DeleteError, HttpResponse> =
    Either.catch {
        return client.delete(childPath(path)) {
            token?.let {headers {
                append(HttpHeaders.Authorization, it)
            }}
        }.right()
    }.mapLeft {
        DeleteError(it.message ?: "Unknown error Delete Request", childPath(path))
    }

suspend inline fun Api.submitForm(path: String, form: Parameters): Either<GetError, HttpResponse> =
    Either.catch {
        return client.submitForm(childPath(path), form).right()
    }.mapLeft {
        GetError(
            it.message ?: "Unknown error Get Request",
            childPath(path)
        )
    }

suspend inline fun <reified T> validateResponse(response: HttpResponse): Either<InvalidResponse, T> {
    return when (response.status) {
        HttpStatusCode.OK -> Either.catch {
            return response.body<T>().right()
        }.mapLeft {
            ParsingError("Error validating response ${it.cause?.message}: ${it.message}")
        }
        HttpStatusCode.Forbidden -> AuthError
            .left()
        HttpStatusCode.BadRequest -> BadRequest("Bad request: ${response.status} ${response.body<String>()}")
            .left()
        HttpStatusCode.NoContent -> NoContent.left()
        else -> {
            UnknownError("Unknown error: $response").left()
        }
    }
}

inline fun <reified T> decodeToJSON(json: String): Either<ParsingError, T> {
    return Either.catch {
        return Json.decodeFromString<T>(json).right()
    }.mapLeft {
        ParsingError("Error parsing JSON ${it.cause?.message}: ${it.message}")
    }
}
