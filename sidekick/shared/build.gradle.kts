plugins {
    kotlin("multiplatform")
    kotlin("native.cocoapods")
    id("com.android.library")
    kotlin("plugin.serialization") version "1.7.20"
}

kotlin {
    android()
    iosX64 {
        compilations["main"].cinterops.create("ios_nw")
    }
    iosArm64 {
        compilations["main"].cinterops.create("ios_nw")
    }
    iosSimulatorArm64()



    cocoapods {
        summary = "Some description for the Shared Module"
        homepage = "Link to the Shared Module homepage"
        version = "1.0"
        ios.deploymentTarget = "13.0"
        podfile = project.file("../App/Podfile")
        framework {
            baseName = "shared"
        }
    }
    
    sourceSets {
        val ktorVersion = "2.1.3"
        val arrowVersion = "1.1.3"
        val commonMain by getting {
            dependencies {
                implementation("io.arrow-kt:arrow-core:$arrowVersion")
                implementation("io.arrow-kt:arrow-optics:$arrowVersion")
                implementation("io.arrow-kt:arrow-fx-coroutines:$arrowVersion")
                implementation("io.arrow-kt:arrow-fx-stm:$arrowVersion")
                // define a BOM and its version
                implementation("io.ktor:ktor-client-core:$ktorVersion")
                implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
                implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")

                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.4.1")

            }
        }
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }
        val androidMain by getting  {
            dependencies {
                implementation(project(":capacitor-android"))
                implementation(project(":capacitor-cordova-android-plugins"))
                implementation("io.ktor:ktor-client-okhttp:$ktorVersion")
            }
        }
        val androidTest by getting
        val iosX64Main by getting
        val iosArm64Main by getting
        val iosSimulatorArm64Main by getting
        val iosMain by creating {
            dependsOn(commonMain)
            iosX64Main.dependsOn(this)
            iosArm64Main.dependsOn(this)
            iosSimulatorArm64Main.dependsOn(this)
            dependencies {
                implementation("io.ktor:ktor-client-darwin:$ktorVersion")
            }
        }
        val iosX64Test by getting
        val iosArm64Test by getting
        val iosSimulatorArm64Test by getting
        val iosTest by creating {
            dependsOn(commonTest)
            iosX64Test.dependsOn(this)
            iosArm64Test.dependsOn(this)
            iosSimulatorArm64Test.dependsOn(this)
        }
    }
}

android {
    namespace = "nz.org.cacophony.sidekick"
    compileSdk = 32
    defaultConfig {
        minSdk = 21
        targetSdk = 32
    }
}
dependencies {
    implementation(project(mapOf("path" to ":capacitor-android")))
}
repositories {
    google()
    mavenCentral()
}
