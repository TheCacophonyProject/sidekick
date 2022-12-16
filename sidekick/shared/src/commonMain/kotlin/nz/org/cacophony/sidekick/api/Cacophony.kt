package nz.org.cacophony.sidekick.api

import io.ktor.client.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

val baseUrl = "https://api.cacophony.org.nz"
val basePath = "/api/v1"
val apiPath:(List<String>) -> String = { path -> "$baseUrl$basePath/${path.joinToString("/")}" }

sealed class Api {
    abstract val client: HttpClient
    abstract val path: String
}

class CacophonyApi: Api() {
    override val client = HttpClient() {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                ignoreUnknownKeys = true
            })
        }
    }
    override val path: String = apiPath(emptyList())
    val userApi = UserApi(client)
}
