package nz.org.cacophony.sidekick

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel

class MainViewModel : ViewModel() {

    val title = MutableLiveData<String>().apply {
        value = ""
    }
}