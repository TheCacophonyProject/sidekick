package nz.org.cacophony.sidekick.fragments

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import nz.org.cacophony.sidekick.*
import nz.org.cacophony.sidekick.db.Event
import nz.org.cacophony.sidekick.db.Recording
import nz.org.cacophony.sidekick.db.RecordingDao

class SettingsFragment : Fragment() {
    private var title = "Settings"

    private lateinit var mainViewModel: MainViewModel
    private lateinit var storageLocation: TextView
    private lateinit var recordingCount: TextView
    private lateinit var eventCount: TextView
    private lateinit var recordingDao: RecordingDao

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        val root = inflater.inflate(R.layout.fragment_settings, container, false)
        val versionText = root.findViewById<TextView>(R.id.app_version_text)
        versionText.text =  BuildConfig.VERSION_NAME
        val userText = root.findViewById<TextView>(R.id.user_text)
        userText.text = CacophonyAPI.getNameOrEmail(context ?: throw Exception("No context for settings fragment"))
        storageLocation = root.findViewById(R.id.settings_storage_location)
        recordingCount = root.findViewById(R.id.settings_recording_count)
        eventCount = root.findViewById(R.id.settings_event_count)
        setViewModelObservers()
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProvider(this).get(MainViewModel::class.java)
        } ?: throw Exception("Invalid Activity")

        val db = mainViewModel.db.value ?: throw Exception("failed to get DB from main view model")
        recordingDao = db.recordingDao()

        mainViewModel.title.value = title
    }

    private fun setViewModelObservers() {
        mainViewModel.storageLocation.observe(viewLifecycleOwner, { updateStorageLocation(it!!) })
        mainViewModel.db.value!!.recordingDao().getRecordingLiveData().observe(viewLifecycleOwner, { data -> updateRecordings(data) })
        mainViewModel.db.value!!.eventDao().getEventLiveData().observe(viewLifecycleOwner, { data -> updateEvents(data) })
    }

    private fun updateRecordings(r: List<Recording>) {
        Log.i(TAG, "update recordings")
        recordingCount.text = "${r.size}"
    }

    private fun updateEvents(r: List<Event>) {
        Log.i(TAG, "update events")
        eventCount.text = "${r.size}"
    }

    private fun updateStorageLocation(path: String) {
        storageLocation.text = path
    }
}