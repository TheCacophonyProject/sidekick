package nz.org.cacophony.sidekick.fragments

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import nz.org.cacophony.sidekick.MainViewModel
import nz.org.cacophony.sidekick.R
import nz.org.cacophony.sidekick.TAG
import nz.org.cacophony.sidekick.db.EventDao
import nz.org.cacophony.sidekick.db.RecordingDao
import kotlin.concurrent.thread

class RecordingsFragment : Fragment() {
    private val title = "Recordings"

    private lateinit var mainViewModel: MainViewModel
    private lateinit var noRecordingsLayout: LinearLayout
    private lateinit var recordingsLayout: LinearLayout
    private lateinit var recordingNumberText: TextView
    private lateinit var eventNumberText: TextView
    private lateinit var uploadButton: Button
    private lateinit var uploadRecordingStatus: TextView
    private lateinit var uploadEventStatus: TextView
    private lateinit var recordingDao: RecordingDao
    private lateinit var eventDao: EventDao

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        val root = inflater.inflate(R.layout.fragment_recordings, container, false)
        noRecordingsLayout = root.findViewById(R.id.no_recordings_layout)
        recordingsLayout = root.findViewById(R.id.recordings_layout)
        recordingNumberText = root.findViewById(R.id.recording_count)
        eventNumberText = root.findViewById(R.id.event_count)
        uploadButton = root.findViewById(R.id.upload_recordings_button)
        uploadRecordingStatus = root.findViewById(R.id.upload_recordings_status)
        uploadEventStatus = root.findViewById(R.id.upload_event_status)
        updateView()
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProvider(this).get(MainViewModel::class.java)
        } ?: throw Exception("Invalid Activity")

        val db = mainViewModel.db.value ?: throw Exception("failed to get DB from main view model")
        recordingDao = db.recordingDao()
        eventDao = db.eventDao()

        mainViewModel.title.value = title
        setViewModelObserves()
    }

    private fun setViewModelObserves() {
        mainViewModel.db.observe(this, { updateView() })
        mainViewModel.uploading.observe(this, { updateView() })
        mainViewModel.recordingUploadingProgress.observe(this, { updateView() })
        mainViewModel.eventUploadingProgress.observe(this, { updateView() })
    }

    override fun onResume() {
        updateView()
        super.onResume()
    }

    @SuppressLint("SetTextI18n")
    private fun updateView() {
        Log.i(TAG, "update recordings fragment")
        thread {
            val numRecordingsToUpload = recordingDao.getRecordingsToUpload().size
            val numEventsToUpload = eventDao.getEventsToUpload().size
            requireActivity().runOnUiThread {
                if (numRecordingsToUpload == 0 && numEventsToUpload == 0) {
                    noRecordingsLayout.visibility = View.VISIBLE
                    recordingsLayout.visibility = View.GONE
                } else {
                    noRecordingsLayout.visibility = View.GONE
                    recordingsLayout.visibility = View.VISIBLE
                }
                recordingNumberText.text = "$numRecordingsToUpload"
                eventNumberText.text = "$numEventsToUpload"

                if (mainViewModel.uploading.value == true) {
                    uploadRecordingStatus.text = "Sending ${mainViewModel.recordingUploadingProgress.value} of ${mainViewModel.recordingsBeingUploadedCount.value} recordings"
                    uploadRecordingStatus.visibility = View.VISIBLE

                    uploadEventStatus.text = "Sending ${mainViewModel.eventUploadingProgress.value} of ${mainViewModel.eventsBeingUploadedCount.value} events"
                    uploadEventStatus.visibility = View.VISIBLE

                    uploadButton.isClickable = false
                    uploadButton.alpha = .5f
                    uploadButton.text = "SENDING RECORDINGS"
                } else {
                    uploadRecordingStatus.visibility = View.GONE
                    uploadEventStatus.visibility = View.GONE
                    uploadButton.text = "SEND TO CACOPHONY CLOUD"
                    uploadButton.isClickable = true
                    uploadButton.alpha = 1f
                }
            }
        }
    }
}