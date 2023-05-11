package nz.org.cacophony.sidekick

import arrow.core.*
import arrow.optics.optics
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.client.utils.EmptyContent.headers
import io.ktor.http.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.cacophony.Token

sealed interface ApiError
sealed class ServerError : ApiError {
    abstract val statusCode: HttpStatusCode
    abstract val message: String
    override fun toString(): String {
        return "Server error with status code ${statusCode.value}: $message"
    }
}

// Modify InvalidResponse to include the new ServerError
@optics
sealed class InvalidResponse : ApiError {
    data class Server(val error: ServerError) : InvalidResponse()
    object NoContent : InvalidResponse()
    data class ParsingError(val message: String) : InvalidResponse()
    data class UnknownError(val message: String) : InvalidResponse()
}

suspend inline fun handleServerError(response: HttpResponse): InvalidResponse.Server {
    val errorText = response.body<String>()
    return InvalidResponse.Server(
        when (response.status) {
            HttpStatusCode.BadRequest -> BadRequest(response.status, errorText)
            HttpStatusCode.Forbidden -> AuthError(response.status, errorText)
            else -> UnknownServerError(response.status, errorText)
        }
    )
}

suspend inline fun <reified T> validateResponse(response: HttpResponse): Either<InvalidResponse, T> {
    return when (response.status) {
        HttpStatusCode.OK -> Either.catch {
            return response.body<T>().right()
        }.mapLeft {
            InvalidResponse.ParsingError("Error validating response ${it.cause?.message}: ${it.message}")
        }
        HttpStatusCode.NoContent -> InvalidResponse.NoContent.left()
        else -> handleServerError(response).left()
    }
}

data class UnknownServerError(override val statusCode: HttpStatusCode, override val message: String) : ServerError()
data class BadRequest(override val statusCode: HttpStatusCode, override val message: String) : ServerError()
data class AuthError(override val statusCode: HttpStatusCode, override val message: String) : ServerError()

@optics
sealed interface TokenError : ApiError {
    override fun toString(): String
}

@optics
data class InvalidIso8601Date(val message: String = "Invalid ISO8601 date") : TokenError {
    override fun toString(): String = message
}

@optics
data class ExpiredToken(val message: String = "Token has expired") : TokenError {
    override fun toString(): String = message
}

interface Api {
    val client: HttpClient
    var basePath: String
    val currentPath: String
    val path: String get() = "$basePath$currentPath"
    fun childPath(child: String): String = "$path/$child"
}
// Add a new type alias for the request function
typealias RequestFunction = HttpRequestBuilder.() -> Unit

// Add a new sealed class HttpRequestError to handle different request errors
@optics
data class HttpRequestError constructor(val requestType: String, val message: String, val path: String) : ApiError {
    override fun toString(): String {
        return "$requestType request error at $path: $message"
    }

    // Add a companion object to provide a factory function
    companion object {
        fun create(requestType: String, message: String, path: String): HttpRequestError {
            return HttpRequestError(requestType, message, path)
        }
    }
}
// Modify the request function to use a lambda function instead of an extension function
inline fun Api.request(
    requestType: String,
    requestFunction: () -> HttpResponse,
): Either<ApiError, HttpResponse> = Either.catch {
    return requestFunction().right()
}.mapLeft { HttpRequestError.create(requestType, it.message ?: "Unknown error $requestType Request", childPath(path)) }

// Refactor Api.getRequest, deleteRequest, etc. to use the modified request function
// Refactor Api.getRequest, deleteRequest, etc. to include the block parameter
suspend inline fun Api.getRequest(path: String, token: Token? = null): Either<ApiError, HttpResponse> =
    request("Get") {
        client.get(childPath(path)) {
            headers {
                token?.let { append(HttpHeaders.Authorization, token) }
            }
        }
}

suspend inline fun Api.deleteRequest(path: String, token: Token? = null): Either<ApiError, HttpResponse> = request("Delete") {
        client.delete(childPath(path)) {
            headers {
                token?.let { append(HttpHeaders.Authorization, token) }
            }
        }
}

// Update other functions similarly
suspend inline fun <reified T> Api.postJSON(
    path: String,
    body: T,
    token: Token? = null,
    url: String = childPath(path)
): Either<ApiError, HttpResponse> = request("Post") {
    client.post(url) {
        headers {
            token?.let { append(HttpHeaders.Authorization, token) }
            append(HttpHeaders.ContentType, ContentType.Application.Json)
        }
        body?.let { setBody(body) }
    }
}
suspend inline fun <reified T> Api.patchJSON(
    path: String,
    body: T,
    token: Token? = null,
): Either<ApiError, HttpResponse> = request("Post") {
    client.patch(childPath(path)) {
        headers {
            token?.let { append(HttpHeaders.Authorization, token) }
            append(HttpHeaders.ContentType, ContentType.Application.Json)
        }
        body?.let { setBody(body) }
    }
}
suspend inline fun Api.submitForm(
    path: String,
    form: Parameters,
    token: Token? = null,
    encodeInQuery: Boolean = false
): Either<ApiError, HttpResponse> = request("SubmitForm") {
    client.submitForm(childPath(path), form, encodeInQuery) {
        headers {
            token?.let { append(HttpHeaders.Authorization, token) }
        }
    }
}

suspend fun Api.submitFormWithBinaryData(
    path: String,
    form: Parameters,
    token: Token? = null,
    encodeInQuery: Boolean = false,
    callback: (formData: FormDataContent) -> Unit
): Either<ApiError, HttpResponse> = request("SubmitFormWithBinaryData") {
    client.submitFormWithBinaryData(url = childPath(path)) {
        headers {
            token?.let { append(HttpHeaders.Authorization, token) }
        }
    }
}

suspend inline fun Api.post(
    path: String,
    block: HttpRequestBuilder.() -> Unit = {},
): Either<ApiError, HttpResponse> = request("Post") {
    client.post(childPath(path)) {
        headers {
            append(HttpHeaders.ContentType, ContentType.Application.Json)
        }
        block()
    }
}

suspend inline fun Api.get(
    path: String,
    block: HttpRequestBuilder.() -> Unit = {},
): Either<ApiError, HttpResponse> = request("Get") {
    client.get(childPath(path)) {
        headers {
            append(HttpHeaders.ContentType, ContentType.Application.Json)
        }
        block()
    }
}

suspend inline fun Api.delete(
    path: String,
    block: HttpRequestBuilder.() -> Unit = {},
): Either<ApiError, HttpResponse> = request("Delete") {
    client.delete(childPath(path)) {
        headers {
            append(HttpHeaders.ContentType, ContentType.Application.Json)
        }
        block()
    }
}


inline fun <reified T> decodeToJSON(json: String): Either<InvalidResponse.ParsingError, T> {
    return Either.catch {
        return Json.decodeFromString<T>(json).right()
    }.mapLeft {
        InvalidResponse.ParsingError("Error parsing JSON ${it.cause?.message}: ${it.message}")
    }
}
