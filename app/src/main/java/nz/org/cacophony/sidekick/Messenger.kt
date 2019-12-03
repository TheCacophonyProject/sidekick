package nz.org.cacophony.sidekick

import android.app.Activity
import android.app.AlertDialog

class Messenger(private val activity: Activity) {

    fun toast(message: String) {
        activity.runOnUiThread {
            android.widget.Toast.makeText(activity.applicationContext, message, android.widget.Toast.LENGTH_LONG).show()
        }
    }

    fun alert(message: String) {
        activity.runOnUiThread {
            val dialogBuilder = AlertDialog.Builder(activity)
            dialogBuilder
                    .setMessage(message)
                    .setCancelable(false)
                    .setPositiveButton("OK", { _, _ -> })
            val alert = dialogBuilder.create()
            alert.setTitle("Message")
            alert.show()
        }
    }
}