package nz.org.cacophony.sidekick

import android.content.Context
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import nz.org.cacophony.sidekick.cacophony.CacophonyInterface

@CapacitorPlugin(name = "Cacophony")
class CacophonyPlugin: Plugin() {
    lateinit var cacophony: CacophonyInterface;

    override fun load() {
       cacophony = CacophonyInterface(context.filesDir.absolutePath);
    }

    @PluginMethod
    fun authenticateUser(call: PluginCall) {
        cacophony.authenticateUser(pluginCall(call))
    }
    @PluginMethod
    fun requestDeletion(call: PluginCall) {
        cacophony.requestDeletion(pluginCall(call))
    }
    @PluginMethod
    fun validateToken(call: PluginCall) {
        cacophony.validateToken(pluginCall(call))
    }
    @PluginMethod
    fun setToTestServer(call: PluginCall) {
        cacophony.setToTestServer(pluginCall(call))
    }
    @PluginMethod
    fun setToProductionServer(call: PluginCall) {
        cacophony.setToProductionServer(pluginCall(call))
    }
    @PluginMethod
    fun uploadRecording(call: PluginCall) {
        cacophony.uploadRecording(pluginCall(call))
    }
    @PluginMethod
    fun uploadEvent(call: PluginCall) {
        cacophony.uploadEvent(pluginCall(call))
    }
}