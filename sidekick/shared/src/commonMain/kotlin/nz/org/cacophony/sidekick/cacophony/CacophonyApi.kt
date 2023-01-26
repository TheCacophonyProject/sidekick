package nz.org.cacophony.sidekick.cacophony

import io.ktor.client.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.Api
import nz.org.cacophony.sidekick.cacophony.user.UserApi

const val prodUrl = "https://api.cacophony.org.nz/api/v1"
const val testUrl = "https://api-test.cacophony.org.nz/api/v1"

typealias Message = String

sealed interface ApiResult {
    val result: String
}

@Serializable
data class  ApiSuccess<T>(val data: T): ApiResult {
    override val result: String = "success"
}

@Serializable
data class ApiError(val error: String): ApiResult {
    override val result: String = "error"
}

class CacophonyApi: Api {
    override var basePath: String = prodUrl
    override val currentPath: String = "/"
    override val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                ignoreUnknownKeys = true
            })
        }
    }
    val userApi =  {UserApi(path)}
    fun setToTest() {
        basePath = testUrl
    }
    fun setToProd() {
        basePath = prodUrl
    }
}
