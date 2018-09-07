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
    private lateinit var viewAdapter: RecyclerView.Adapter<*>
    private lateinit var viewManager: RecyclerView.LayoutManager
    private lateinit var mDnsManager: NsdManager
    private lateinit var discoveryListener: NsdManager.DiscoveryListener

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val dataset = arrayOf("one", "two", "three")

        viewManager = LinearLayoutManager(this)
        viewAdapter = MyAdapter(dataset)

        recyclerView = findViewById<RecyclerView>(R.id.device_list).apply {
            // use this setting to improve performance if you know that changes
            // in content do not change the layout size of the RecyclerView
            setHasFixedSize(true)

            // use a linear layout manager
            layoutManager = viewManager

            // specify an viewAdapter (see also next example)
            adapter = viewAdapter

        }

        mDnsManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        discoveryListener = DeviceListener(mDnsManager)
        mDnsManager.discoverServices("_googlecast._tcp", NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    // FIXME handle transitions
}

class MyAdapter(private val myDataset: Array<String>) :
        RecyclerView.Adapter<MyAdapter.MyViewHolder>() {

    // Provide a reference to the views for each data item
    // Complex data items may need more than one view per item, and
    // you provide access to all the views for a data item in a view holder.
    // Each data item is just a string in this case that is shown in a TextView.
    class MyViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val textView: TextView

        init {
            textView = v.findViewById(R.id.device_name)
        }
    }


    // Create new views (invoked by the layout manager)
    override fun onCreateViewHolder(parent: ViewGroup,
                                    viewType: Int): MyAdapter.MyViewHolder {
        // create a new view
        val textView = LayoutInflater.from(parent.context)
                .inflate(R.layout.device_row, parent, false)
        return MyViewHolder(textView)
    }

    // Replace the contents of a view (invoked by the layout manager)
    override fun onBindViewHolder(holder: MyViewHolder, position: Int) {
        // - get element from your dataset at this position
        // - replace the contents of the view with that element
        holder.textView.text = myDataset[position]
    }

    // Return the size of your dataset (invoked by the layout manager)
    override fun getItemCount() = myDataset.size
}
