package nz.org.cacophony.sidekick

import android.annotation.SuppressLint
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.JsResult

import android.webkit.WebChromeClient




class DeviceWebViewActivity : AppCompatActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_device_web_view)

        WebView.setWebContentsDebuggingEnabled(true)
        val extras = intent.extras
        if (extras != null) {
            val uri = extras.getString("uri") ?: ""
            val myWebView = findViewById<WebView>(R.id.device_web_view)
            myWebView.settings.domStorageEnabled = true
            myWebView.settings.javaScriptEnabled = true
            myWebView.webViewClient = WebViewClient()
            Log.i(TAG, "Opening web view to $uri")
            myWebView.loadUrl(uri)
            myWebView.setWebChromeClient(object : WebChromeClient() {
                //Other methods for your WebChromeClient here, if needed..
                override fun onJsAlert(
                    view: WebView,
                    url: String,
                    message: String,
                    result: JsResult
                ): Boolean {
                    return super.onJsAlert(view, url, message, result)
                }
            })
        }
    }


}