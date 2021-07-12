package nz.org.cacophony.sidekick.fragments

import android.os.Bundle
import androidx.fragment.app.Fragment
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.lifecycle.ViewModelProviders
import nz.org.cacophony.sidekick.MainViewModel
import nz.org.cacophony.sidekick.R

class DevFragment : Fragment() {
    private var title = "Dev Page"

    private lateinit var mainViewModel: MainViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mainViewModel = activity?.run {
            ViewModelProviders.of(this)[MainViewModel::class.java]
        } ?: throw Exception("Invalid Activity")

        mainViewModel.title.value = title
    }

    override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View? {
        // Inflate the layout for this fragment
        return inflater.inflate(R.layout.fragment_dev, container, false)
    }
}