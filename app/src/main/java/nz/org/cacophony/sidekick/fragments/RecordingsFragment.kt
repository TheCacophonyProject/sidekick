package nz.org.cacophony.sidekick.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.MainViewModel
import nz.org.cacophony.sidekick.R
import kotlin.concurrent.thread

class RecordingsFragment : Fragment() {
    private val title = "Recordings"

    private lateinit var mainViewModel: MainViewModel
    private lateinit var noRecordingsLayout: LinearLayout
    private lateinit var recordingsLayout: LinearLayout
    private lateinit var recordingNumberText: TextView
    private lateinit var uploadButton: Button
    private lateinit var uploadStatus: TextView

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
        uploadButton = root.findViewById(R.id.upload_recordings_button)
        uploadStatus = root.findViewById(R.id.upload_recordings_status)
        updateView()
        return root
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        mainViewModel = activity?.run {
            ViewModelProviders.of(this)[MainViewModel::class.java]
        } ?: throw Exception("Invalid Activity")

        mainViewModel.title.value = title
        setViewModelObserves()

    }

    private fun setViewModelObserves() {
        mainViewModel.uploadingRecordings.observe(this, Observer { updateView() })
        mainViewModel.recordingDao.observe(this, Observer { updateView() })
        mainViewModel.recordingUploadingProgress.observe(this, Observer { updateView() })
    }

    override fun onResume() {
        updateView()
        super.onResume()
    }


    private fun updateView() {
        thread {
            val numToUpload = mainViewModel.recordingDao.value!!.recordingsToUpload.size
            activity!!.runOnUiThread {
                if (numToUpload > 0) {
                    recordingNumberText.text = "$numToUpload"
                    noRecordingsLayout.visibility = View.GONE
                    recordingsLayout.visibility = View.VISIBLE
                } else {
                    recordingsLayout.visibility = View.GONE
                    noRecordingsLayout.visibility = View.VISIBLE
                }

                if (mainViewModel.uploadingRecordings.value!!) {
                    uploadStatus.text =
                            "Sending ${mainViewModel.recordingUploadingProgress.value} of ${mainViewModel.recordingUploadingCount.value} recordings"
                    uploadStatus.visibility = View.VISIBLE
                    uploadButton.isClickable = false
                    uploadButton.alpha = .5f
                    uploadButton.text = "SENDING RECORDINGS"
                } else {
                    uploadStatus.visibility = View.GONE
                    uploadButton.text = "SEND TO CACOPHONY CLOUD"
                    uploadButton.isClickable = true
                    uploadButton.alpha = 1f
                }
            }
        }
    }
}