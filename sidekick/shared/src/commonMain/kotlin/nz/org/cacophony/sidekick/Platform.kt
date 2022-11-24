package nz.org.cacophony.sidekick

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform