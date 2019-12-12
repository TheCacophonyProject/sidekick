package nz.org.cacophony.sidekick.ui.devices

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel

class DevicesViewModel : ViewModel() {

    private val _text = MutableLiveData<String>().apply {
        value = "This is devices Fragment"
    }
    val text: LiveData<String> = _text
}