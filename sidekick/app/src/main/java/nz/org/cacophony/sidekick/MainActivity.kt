package nz.org.cacophony.sidekick

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(DashboardPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}