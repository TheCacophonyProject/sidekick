package nz.org.cacophony.sidekick

import arrow.core.Either
import arrow.core.left
import arrow.core.right
import arrow.optics.optics
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@optics
sealed interface ApiResult

@optics
sealed class InvalidRequest : ApiResult
data class PostError(val message: String, val path: String) : InvalidRequest()
data class GetError(val message: String, val path: String) : InvalidRequest()
data class FormError(val message: String, val path: String) : InvalidRequest()

@optics
sealed class InvalidResponse : ApiResult
object AuthError : InvalidResponse()
data class BadRequest(val message: String) : InvalidResponse()
data class ParsingError(val message: String) : InvalidResponse()
data class UnknownError(val message: String) : InvalidResponse()
object NoContent: InvalidResponse() {
    val message: String = "No response"
}


interface Api {
    val basePath: String
    val currentPath: String
    val client: HttpClient
    val path: String get() = "$basePath$currentPath"
    fun childPath(child: String): String = "$path/$child"
}

suspend inline fun <reified T> Api.postJSON(
    path: String,
    body: T
): Either<PostError, HttpResponse> = Either.catch {
    return client.post(childPath(path)) {
        contentType(ContentType.Application.Json)
        setBody(body)
    }.right()
}.mapLeft { PostError(it.message ?: "Unknown error Post Request", childPath(path)) }

suspend inline fun Api.getRequest(path: String): Either<FormError, HttpResponse> =
    Either.catch {
        return client.get(childPath(path)).right()
    }.mapLeft {
        FormError(it.message ?: "Unknown error Get Request", childPath(path))
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