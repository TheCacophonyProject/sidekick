package nz.org.cacophony.sidekick

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    public override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(DevicePlugin::class.java)
        registerPlugin(CacophonyPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}