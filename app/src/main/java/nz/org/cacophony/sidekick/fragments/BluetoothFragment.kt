package nz.org.cacophony.sidekick.fragments

import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.annotation.RequiresApi
import androidx.fragment.app.Fragment
import nz.org.cacophony.sidekick.R
import nz.org.cacophony.sidekick.TAG
import java.util.zip.CRC32
import kotlin.concurrent.thread


class BluetoothFragment : Fragment() {


    @RequiresApi(Build.VERSION_CODES.O)
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_bluetooth, container, false)

        view.findViewById<Button>(R.id.bt_start).setOnClickListener { beaconCall(view) }
        return view
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun beaconCall(v: View) {
        Log.i(TAG, "Making a beacon call")
        val button = v.findViewById<Button>(R.id.bt_start)
        val animal = v.findViewById<Spinner>(R.id.bt_animal).selectedItemPosition.toUInt().toByte()
        val confidenceStr = v.findViewById<EditText>(R.id.bt_confidence).text.toString() //.toUInt().toByte()
        confidenceStr.toUIntOrNull()

        val confidence = confidenceStr.toUIntOrNull()
        if (confidence == null) {
            Toast.makeText(context, "Please enter a valid confidence", Toast.LENGTH_SHORT).show()
            return
        }
        val deviceIDStr = v.findViewById<EditText>(R.id.bt_device_id).text.toString()
        val deviceID = deviceIDStr.toUIntOrNull()
        if (deviceID == null) {
            Toast.makeText(context, "Please enter a valid DeviceID", Toast.LENGTH_SHORT).show()
            return
        }
        val durationStr = v.findViewById<EditText>(R.id.bt_duration).text.toString()
        val duration = durationStr.toUIntOrNull()
        if (duration == null) {
            Toast.makeText(context, "Please enter a valid Duration", Toast.LENGTH_SHORT).show()
            return
        }

        requireActivity().runOnUiThread {
            button.isClickable = false
            button.text = "Sending beacon..."
            button.alpha = .5f
        }

        var btData = byteArrayOf(
            0x01.toByte(),
            (deviceID shr 8).toByte(),
            (deviceID).toByte(),
            0x03.toByte(),
            0x01.toByte(),
            animal,
            confidence.toByte(),
        )
        val crc = CRC32()
        crc.update(btData)
        btData += (crc.value shr 24).toByte()
        btData += (crc.value shr 16).toByte()
        btData += (crc.value shr 8).toByte()
        btData += (crc.value shr 0).toByte()

        val advertiser = BluetoothAdapter.getDefaultAdapter().bluetoothLeAdvertiser
        val parameters = AdvertisingSetParameters.Builder()
            .setLegacyMode(true) // True by default, but set here as a reminder.
            .setConnectable(false)
            .setInterval(AdvertisingSetParameters.INTERVAL_HIGH)
            .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_MEDIUM)
            .build()
        val data = AdvertiseData.Builder().apply {
            addManufacturerData(0x1212, btData)
            setIncludeDeviceName(false).build()
        }.build()

        val callback: AdvertisingSetCallback = object : AdvertisingSetCallback() {}

        advertiser.startAdvertisingSet(parameters, data, null, null, null, callback)
        Toast.makeText(context, "Starting Beacon", Toast.LENGTH_SHORT).show()
        thread {
            Thread.sleep(duration.toLong()*1000)
            activity?.runOnUiThread {
                Toast.makeText(context, "Stopping Beacon", Toast.LENGTH_SHORT).show()
                advertiser.stopAdvertisingSet(callback)
                button.isClickable = true
                button.text = "Start Beacon"
                button.alpha = 1f
            }
        }


    }
}