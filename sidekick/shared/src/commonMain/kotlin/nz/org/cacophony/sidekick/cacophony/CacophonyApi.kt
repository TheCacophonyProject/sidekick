package nz.org.cacophony.sidekick.cacophony

import io.ktor.client.*
import io.ktor.client.plugins.auth.*
import io.ktor.client.plugins.auth.providers.*
import io.ktor.client.plugins.compression.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json
import nz.org.cacophony.sidekick.Api

const val prodUrl = "https://api.cacophony.org.nz/api/v1"
const val testUrl = "https://api-test.cacophony.org.nz/api/v1"
const val browseProdUrl = "https://browse.cacophony.org.nz/api/v1"
const val browseTestUrl = "https://browse-test.cacophony.org.nz/api/v1"

class CacophonyApi: Api {
    override var basePath: String = prodUrl
    override val currentPath: String = ""
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
    fun setToTest() {
        println("Setting to test")
        basePath = testUrl
    }
    fun setToProd() {
        println("Setting to prod")
        basePath = prodUrl
    }
}
