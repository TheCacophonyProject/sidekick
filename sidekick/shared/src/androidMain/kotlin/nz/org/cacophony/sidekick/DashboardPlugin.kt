package nz.org.cacophony.sidekick

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;


@CapacitorPlugin(name = "Dashboard")
class DashboardPlugin: Plugin() {
    @PluginMethod
    fun getTest(call: PluginCall) {
        val test = JSObject();
        test.put("test", "test");
        // create delay of 3 seconds

        call.resolve(test);
    }
}