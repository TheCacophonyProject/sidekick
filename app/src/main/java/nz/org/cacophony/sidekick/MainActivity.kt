package nz.org.cacophony.sidekick

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.nsd.NsdManager
import android.os.Bundle
import android.provider.Browser
import android.support.v7.app.AppCompatActivity
import android.support.v7.widget.LinearLayoutManager
import android.support.v7.widget.RecyclerView

const val TAG = "cacophony-manager"

class MainActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var mDnsManager: NsdManager
    private lateinit var discoveryListener: DeviceListener

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val devices = DeviceList()
        deviceListAdapter = DeviceListAdapter(devices) { h -> onDeviceClick(h) }
        devices.setOnChanged { runOnUiThread { deviceListAdapter.notifyDataSetChanged() } }

        val recyclerLayoutManager = LinearLayoutManager(this)
        recyclerView = findViewById<RecyclerView>(R.id.device_list).apply {
            setHasFixedSize(true)
            layoutManager = recyclerLayoutManager
            adapter = deviceListAdapter
        }

        mDnsManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discoveryListener = DeviceListener(mDnsManager, devices)
        discoveryListener.startDiscovery()
    }

    fun onDeviceClick(d: Device) {
        // FIXME port
        var uri = Uri.parse("http://${d.hostname}/")
        val urlIntent = Intent(Intent.ACTION_VIEW, uri)

        // Single browse tab per device.
        urlIntent.putExtra(Browser.EXTRA_APPLICATION_ID, "${TAG}-${d.name}")

        startActivity(urlIntent)
    }

    // FIXME handle application state transitions
}

