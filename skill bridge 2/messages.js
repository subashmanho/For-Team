import React, { useState } from 'react';
import { supabase } from './js/supabaseClient.js';

export default function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Save to Supabase
    const { data, error } = await supabase
      .from('messages') // replace with your table name
      .insert([
        { name: formData.name, email: formData.email }
      ]);

    if (error) {
      console.error('Error saving data:', error.message);
    } else {
      console.log('Data saved successfully!', data);
      setFormData({ name: '', email: '' }); // Reset form
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="text" 
        value={formData.name}
        onChange={(e) => setFormData({...formData, name: e.target.value})}
        placeholder="Your Name" 
      />
      <input 
        type="email" 
        value={formData.email}
        onChange={(e) => setFormData({...formData, email: e.target.value})}
        placeholder="Your Email" 
      />
      <button type="submit">Submit</button>
    </form>
  );
}
