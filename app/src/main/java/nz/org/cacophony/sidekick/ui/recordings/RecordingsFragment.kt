package nz.org.cacophony.sidekick.ui.recordings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.R

class RecordingsFragment : Fragment() {

    private lateinit var recordingsViewModel: RecordingsViewModel

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        container?.removeAllViews()
        recordingsViewModel = ViewModelProviders.of(this).get(RecordingsViewModel::class.java)
        val root = inflater.inflate(R.layout.fragment_recordings, container, false)
        val textView: TextView = root.findViewById(R.id.text_recordings)
        recordingsViewModel.text.observe(this, Observer { textView.text = it })
        return root
    }
}