package nz.org.cacophony.sidekick

import android.content.Context
import android.net.nsd.NsdManager
import android.os.Bundle
import android.support.v7.app.AppCompatActivity
import android.support.v7.widget.LinearLayoutManager
import android.support.v7.widget.RecyclerView
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView

const val TAG = "cacophony-manager"

class MainActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var deviceListAdapter: DeviceListAdapter
    private lateinit var mDnsManager: NsdManager
    private lateinit var discoveryListener: DeviceListener

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        deviceListAdapter = DeviceListAdapter()

        val recyclerLayoutManager = LinearLayoutManager(this)
        recyclerView = findViewById<RecyclerView>(R.id.device_list).apply {
            setHasFixedSize(true)
            layoutManager = recyclerLayoutManager
            adapter = deviceListAdapter
        }

        mDnsManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discoveryListener = DeviceListener(mDnsManager, deviceListAdapter)
        discoveryListener.startDiscovery()
    }

    // FIXME handle application state transitions
}

class DeviceListAdapter: RecyclerView.Adapter<DeviceListAdapter.DeviceViewHolder>() {
    val deviceNames = sortedSetOf<String>()

    class DeviceViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val deviceNameView = v.findViewById(R.id.device_name) as TextView
    }

    override fun onCreateViewHolder(parent: ViewGroup,
                                    viewType: Int): DeviceListAdapter.DeviceViewHolder {
        val rowView = LayoutInflater.from(parent.context)
                .inflate(R.layout.device_row, parent, false)
        return DeviceViewHolder(rowView)
    }

    override fun onBindViewHolder(holder: DeviceViewHolder, position: Int) {
        holder.deviceNameView.text = deviceNames.elementAt(position)
    }

    override fun getItemCount() = deviceNames.size


    fun addDevice(name: String) {
        deviceNames.add(name)
        notifyDataSetChanged()
    }

    fun removeDevice(name: String) {
        deviceNames.remove(name)
        notifyDataSetChanged()
    }

}
