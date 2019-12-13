package nz.org.cacophony.sidekick.ui.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.BuildConfig
import nz.org.cacophony.sidekick.R

class SettingsFragment : Fragment() {

    private lateinit var settingsViewModel: SettingsViewModel

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        settingsViewModel = ViewModelProviders.of(this).get(SettingsViewModel::class.java)
        val root = inflater.inflate(R.layout.fragment_settings, container, false)
        val versionText = root.findViewById<TextView>(R.id.app_version_text)
        versionText.setText("Sidekick v${BuildConfig.VERSION_NAME}")
        return root
    }
}