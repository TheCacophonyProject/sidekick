package nz.org.cacophony.sidekick.fragments

import android.annotation.SuppressLint
import android.os.Bundle
import androidx.fragment.app.Fragment
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import nz.org.cacophony.sidekick.R

private const val URL_PARAM = "url_param"

/**
 * A simple [Fragment] subclass.
 * Use the [DeviceWebViewFragment.newInstance] factory method to
 * create an instance of this fragment.
 */
class DeviceWebViewFragment : Fragment() {
    private var url: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        arguments?.let {
            url = it.getString(URL_PARAM)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        // Inflate the layout for this fragment
        container?.removeAllViews()
        val root = inflater.inflate(R.layout.fragment_device_web_view, container, false)
        val webView = root.findViewById<WebView>(R.id.device_web_view)
        /*
            myWebView.settings.domStorageEnabled = true
            myWebView.settings.mediaPlaybackRequiresUserGesture = false
            myWebView.settings.safeBrowsingEnabled = false
            myWebView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            myWebView.webViewClient = WebViewClient()
        */
        webView.settings.javaScriptEnabled = true
        webView.loadUrl(url)
        return root
    }

    companion object {
        @JvmStatic
        fun newInstance(url: String) =
            DeviceWebViewFragment().apply {
                arguments = Bundle().apply {
                    putString(URL_PARAM, url)
                }
            }
    }
}