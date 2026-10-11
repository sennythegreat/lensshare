'use client'

import { OwnerShell, OwnerStats, PageCard, OwnerHeading, OwnerTable } from '@/components/owner-shell'

const rows = [['Sony ZV-E10 & 16–50mm Kit','ACTIVE RENTAL','Oct 24–27 · 4 days · Paolo R.','₱1,800.00','VIEW CHECKLIST'],['Fujifilm X-T30 II Silver Body','PENDING REQUEST','Oct 28–30 · 3 days · Alyssa C.','₱1,800.00','VIEW DETAILS'],['Sigma 16mm f/1.4 Lens','COMPLETED','Oct 20–23 · Marcus B.','₱1,050.00','VIEW RETURN'],['Godox SL60W Video Light Kit','APPROVED','Nov 01–03 · Bicol Indie Lab','₱900.00','VIEW DETAILS']]
export default function RentalsPage(){return <OwnerShell title="Manage Rentals" subtitle="Review requests, coordinate handoffs, and keep every booking moving."><OwnerStats/><div className="owner-toolbar"><div><OwnerHeading eyebrow="BOOKING OPERATIONS" title="Rental requests & active bookings" detail="Demo booking records are clearly labeled until a backend is connected."/></div><div className="owner-filters"><button className="selected">All rentals</button><button>Pending</button><button>Active</button><button>Returned</button></div></div><PageCard><OwnerTable rows={rows}/></PageCard></OwnerShell>}
