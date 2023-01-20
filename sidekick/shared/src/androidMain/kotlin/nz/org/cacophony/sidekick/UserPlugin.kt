package nz.org.cacophony.sidekick

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import nz.org.cacophony.sidekick.cacophony.user.UserInterface

@CapacitorPlugin(name = "User")
class UserPlugin: Plugin() {
    private val userInterface = UserInterface()
    @PluginMethod
    fun authenticateUser(call: PluginCall) {
        userInterface.authenticateUser(pluginCall(call))
    }
}