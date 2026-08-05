buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.9.2")
        classpath("com.google.gms:google-services:4.4.2")
        classpath("com.google.firebase:firebase-crashlytics-gradle:3.0.0")
    }
}
plugins {
    //trick: for the same plugin versions in all sub-modules
    id("com.android.application").version("8.9.2").apply(false)
    id("com.android.library").version("8.9.2").apply(false)
    id("org.jetbrains.kotlin.plugin.serialization").version("1.9.25")
    kotlin("android").version("1.9.25").apply(false)
    kotlin("multiplatform").version("1.9.25").apply(false)
}


tasks.register("clean", Delete::class) {
    delete(rootProject.buildDir)
}
allprojects {
    repositories {
        google()
        mavenCentral()
    }
}