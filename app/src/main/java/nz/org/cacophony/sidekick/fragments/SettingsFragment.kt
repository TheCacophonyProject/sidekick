package nz.org.cacophony.sidekick.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.BuildConfig
import nz.org.cacophony.sidekick.MainViewModel
import nz.org.cacophony.sidekick.R

class SettingsFragment : Fragment() {
    private var title = "Settings"

    private lateinit var mainViewModel: MainViewModel

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        val root = inflater.inflate(R.layout.fragment_settings, container, false)
        val versionText = root.findViewById<TextView>(R.id.app_version_text)
        versionText.setText("Sidekick v${BuildConfig.VERSION_NAME}")
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProviders.of(this)[MainViewModel::class.java]
        } ?: throw Exception("Invalid Activity")

        mainViewModel.title.value = title
    }
}