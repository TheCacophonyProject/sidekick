package nz.org.cacophony.sidekick.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.BuildConfig
import nz.org.cacophony.sidekick.CacophonyAPI
import nz.org.cacophony.sidekick.MainViewModel
import nz.org.cacophony.sidekick.R
import nz.org.cacophony.sidekick.db.RecordingDao
import kotlin.concurrent.thread

class SettingsFragment : Fragment() {
    private var title = "Settings"

    private lateinit var mainViewModel: MainViewModel
    private lateinit var storageLocation: TextView
    private lateinit var recordingCount: TextView
    private lateinit var recordingDao: RecordingDao

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        val root = inflater.inflate(R.layout.fragment_settings, container, false)
        val versionText = root.findViewById<TextView>(R.id.app_version_text)
        versionText.text = "v${BuildConfig.VERSION_NAME}"
        val userText = root.findViewById<TextView>(R.id.user_text)
        userText.text = CacophonyAPI.getNameOrEmail(context ?: throw Exception("No context for settings fragment"))
        storageLocation = root.findViewById(R.id.settings_storage_location)
        recordingCount = root.findViewById(R.id.settings_recording_count)
        setViewModelObservers()
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProviders.of(this)[MainViewModel::class.java]
        } ?: throw Exception("Invalid Activity")

        val db = mainViewModel.db.value ?: throw Exception("failed to get DB from main view model")
        recordingDao = db.recordingDao()

        mainViewModel.title.value = title
    }

    private fun setViewModelObservers() {
        mainViewModel.storageLocation.observe(this, Observer { updateStorageLocation(it!!) })
        mainViewModel.db.observe(this, Observer { updateRecordings() })
    }

    private fun updateRecordings() {
        thread {
            recordingCount.text = "${recordingDao.getAllRecordings().size}"
        }
    }

    private fun updateStorageLocation(path: String) {
        storageLocation.text = path
    }
}