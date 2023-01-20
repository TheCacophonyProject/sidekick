package nz.org.cacophony.sidekick.cacophony

import io.ktor.client.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.Api
import nz.org.cacophony.sidekick.cacophony.user.UserApi

const val baseUrl = "https://api.cacophony.org.nz/api/v1"
val apiPath:(List<String>) -> String = { path -> "$baseUrl/${path.joinToString("/")}" }



class CacophonyApi: Api {
    override val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                ignoreUnknownKeys = true
            })
        }
    }
    override val basePath: String = baseUrl
    override val currentPath: String = "/"
    val userApi = UserApi(client, path)
}
